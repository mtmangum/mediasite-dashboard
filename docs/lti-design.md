# Canvas LTI tool: design

Status: draft for review. Date: 2026-10-06.

## Summary

Make the Instructor Dashboard available inside Instructure Canvas as an LTI 1.3 tool, so an
instructor opens it from a course's navigation and sees viewing reports for that course's
Mediasite recordings.

This is a change of kind, not a feature. The dashboard is a local, single-user prototype. As an
LTI tool it becomes a hosted, multi-user service. Most of the work is authorization (who may
see which recordings), hosting, and review. The LTI handshake itself is the smaller part.

## Goals

- An instructor or TA launches the dashboard from a Canvas course and sees only that course's
  recordings and reports.
- Students never see it.
- No new personal data: reports stay anonymous sessions, and no student identity is stored.
- Keep the existing interface, analytics, and demo mode.

## Non-goals

- Grade passback, assignments, or deep linking.
- Showing enrollment or joining Canvas rosters to viewing data.
- Writing anything to Mediasite or Canvas.
- Replacing Mediasite's own Canvas integration or reports.

## Current state and constraints

- Local only: the server binds to loopback and refuses cross-site requests.
- One set of Mediasite credentials in `.env`, used only by the Node server.
- Read-only. Reports are anonymous sessions (counted by network address), never identities.
- Recordings are grouped into courses by parsing titles and dates. A project decision says
  this grouping is a suggestion and must not decide permissions. The LTI version cannot rely
  on it for access (see "Course mapping").
- Caching is in memory, and each load fetches the whole library.

## Architecture

```
Canvas (platform)                    Dashboard service                   Mediasite
  |  1. login initiation  ------------>  /lti/login
  |  <---- 2. auth request (redirect) --
  |  3. id_token (signed JWT) -------->  /lti/launch
  |                                         validate, check role,
  |                                         resolve course -> folder,
  |                                         issue short-lived session
  |  <---- 4. dashboard (in iframe) ----
  |                                      /api/*  ---------------------->  read-only API
  |                                         (scoped to the mapped folder)  (service account)
```

Components:

- **LTI endpoints:** login initiation, launch, and a public key set (JWKS) for the tool.
- **Session:** a short-lived signed token for the launch (see "Embedding").
- **Course mapping store:** Canvas context to Mediasite folder.
- **Mediasite adapter:** the existing library and analytics code, scoped to a folder.
- **Cache and store:** a database for platform registrations and mappings, and a shared cache
  for Mediasite data.
- **Frontend:** the existing app, served by the same service.

### Launch flow

1. Canvas calls `/lti/login` with `iss`, `login_hint`, `target_link_uri`, and
   `lti_message_hint`. The tool looks up the registered platform, creates a `state` and
   `nonce`, and redirects to Canvas's authorization endpoint.
2. Canvas posts a signed `id_token` to `/lti/launch`.
3. The tool validates the token: signature against the platform's published keys (cached),
   `iss`, `aud` (the client id), `exp` and `iat`, a one-time `nonce`, `state`,
   `deployment_id`, the message type `LtiResourceLinkRequest`, and version `1.3.0`.
4. It reads `roles` and `context`, applies the authorization rules, resolves the Mediasite
   folder, and issues a session token bound to that one course.
5. It redirects to the dashboard, which loads data only for that course.

## Authorization

Roles come from the launch token's `roles` claim.

| Role                          | Access                          |
| ----------------------------- | ------------------------------- |
| Instructor, TeachingAssistant | Allowed for the launched course |
| Administrator (institution)   | Allowed, same scoping rules     |
| Learner, anything else        | Refused with a plain message    |

The session token names exactly one course and one Mediasite folder. Every API call is checked
against it on the server, so changing a URL or request cannot reach another course.

### Course mapping (the main open decision)

The service uses one Mediasite service account, so the server alone enforces who sees what.
It therefore needs an authoritative link from a Canvas course to a Mediasite folder, keyed by
platform, deployment, and context id.

| Option                         | How                                                                   | Trade-off                                                                             |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A. Admin-managed table         | An administrator imports or edits course-to-folder rows               | Safest and simplest to audit; needs an owner and upkeep                               |
| B. Use Mediasite's Canvas data | Read the association Mediasite's own Canvas integration already keeps | No new upkeep, if the API exposes it; unverified                                      |
| C. Instructor chooses          | First launch shows a folder picker; the choice is stored              | Easy to roll out; unsafe unless the choice is checked against something authoritative |

Recommendation: A to start, with B investigated in parallel and used as the source if it
exists. Do not use option C, and do not use title parsing, as a permission boundary.

## Embedding

- Canvas shows the tool in an iframe. The service must allow Canvas as an embedder
  (`frame-ancestors` for the Canvas domain), instead of today's blanket deny.
- Browsers restrict third-party cookies, so a cookie session inside the iframe is unreliable.
  Use a short-lived signed token passed with each request, and optionally offer a new-window
  launch for the same link.
- All other pages and API routes keep the current protections: no content sniffing, no referrer
  leakage, JSON only.

## Data, caching, and load

- Fetch only the mapped folder's presentations, not the whole library.
- Cache per folder and per report with a short lifetime, shared across instances, and refresh in
  the background so a launch is fast.
- Limit and queue Mediasite requests so many simultaneous launches cannot overload the server.
- Store only: platform registrations, course mappings, and an audit log.

## Privacy and compliance

- Request Canvas's anonymous privacy level so the launch carries no name or email.
- Store no student data. Viewing reports stay anonymous sessions.
- The audit log keeps a hashed user id, role, course, and time, with a stated retention period.
- Expect a UT security and privacy review (a hosted tool holding a Mediasite service credential)
  and a FERPA review. Prepare the sample-data demo for reviewers.

## Canvas configuration (illustrative; verify against current Canvas documentation)

A Developer Key of type LTI Key, created by a Canvas administrator:

- Title, description, and the tool's `target_link_uri`
- `oidc_initiation_url` pointing at `/lti/login`, and a redirect URI for `/lti/launch`
- `public_jwk_url` pointing at the tool's key set
- Privacy level: anonymous
- Placement: `course_navigation`, limited to teachers and administrators (check the
  placement's visibility setting in the Canvas docs)
- No scopes are needed, because no Canvas services are used

## Hosting and operations

- Public HTTPS hostname and certificate, with a UT-approved host (decision needed).
- Secrets (Mediasite credentials, tool signing keys) in a managed secret store, never in the
  repository or the image. Rotate the signing keys on a schedule.
- Separate environments: a Canvas test or beta instance first, then production.
- Logging and monitoring, with alerts on failed launches and Mediasite errors.
- The Pages demo stays separate and sample-data only.

## Frontend changes

- Launch with the session token instead of "local" mode, and remove the semester and course
  switcher's dependence on the whole library (the course comes from the launch).
- Allow framing, and keep layouts working at the narrow widths Canvas iframes give.
- Keep demo mode, so reviewers can see the tool without a Canvas connection.
- Add a clear refusal page for learners and for courses with no mapping.

## Implementation plan

| Milestone        | Outcome                                                                    | Done when                                                   |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| M0. Decisions    | Mapping option, host, and approvers agreed                                 | Open questions below answered                               |
| M1. Launch       | Login, launch, role gate, and session token against a Canvas test instance | An instructor launches; a student is refused                |
| M2. Scoped data  | Mediasite adapter limited to the mapped folder, with cache and rate limits | A launch shows only that course; cross-course requests fail |
| M3. Hosting      | Deployed service, secrets, logging, monitoring                             | Runs in the approved environment                            |
| M4. Review       | Security, privacy, and accessibility review; fixes                         | Approvals recorded                                          |
| M5. Registration | Developer Key and placement in production                                  | A pilot course uses it                                      |

Effort: M1 and M2 are a few days of focused work each. M0, M3, M4 and M5 depend on UT's hosting
and approval processes and set the real schedule.

## Testing

- Unit tests for token validation with generated test keys: bad signature, wrong issuer or
  audience, expired token, reused nonce, wrong deployment, and missing claims.
- Authorization tests: learner refused, unmapped course refused, session for one course cannot
  read another.
- Integration against a mock platform, then manual runs in a Canvas test instance.
- Accessibility and narrow-width checks inside the Canvas iframe.

## Risks

| Risk                                                       | Mitigation                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Wrong course-to-folder mapping shows another course's data | Admin-managed mapping, scoped session, server-side checks, tests                |
| One shared Mediasite credential is exposed                 | Read-only account, secret store, rotation, audit log                            |
| Many launches overload Mediasite                           | Per-folder cache, background refresh, request limits                            |
| Cookies blocked in the iframe                              | Signed token instead of cookies; new-window option                              |
| Review delays                                              | Start M0 and the review package early; use the demo                             |
| Library choice (for example `ltijs`) becomes unmaintained  | Keep the LTI layer small; check maintenance first; the checks are simple to own |

## Alternatives considered

- **Use Mediasite's own Canvas integration and reports.** Build nothing if it already answers the
  instructor's questions; confirm with the Mediasite administrators first.
- **Keep it a local tool each instructor runs.** No hosting or approval, but every instructor
  needs their own Mediasite key and setup.
- **A plain Canvas link to a hosted page, without LTI.** No reliable way to know who the user or
  course is, so no safe scoping. Rejected.

## Open questions

1. How do Canvas courses map to Mediasite folders at UT today, and does Mediasite's Canvas
   integration store that link in a way the API exposes?
2. Who hosts and operates the service, and what is the approval path?
3. Is this for one college or all of UT, and is there one Canvas instance or several?
4. Can a read-only Mediasite service account see every folder it needs, and no more?
5. What retention period is acceptable for the audit log?
6. Who owns the course-mapping table after launch?

## Effect on existing project decisions

This proposal changes "local, read-only instructor workspace" into a hosted service. Read-only
and anonymous-sessions stay. If accepted, update `docs/HANDOFF.md` and the security review, and
treat "grouping must not determine permissions" as satisfied by the explicit course mapping.
