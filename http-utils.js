// Small helpers shared by the route handlers.
const MAX_BODY = 1024 * 1024;

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return; // keep draining so the error response can be delivered
      size += c.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        reject(
          Object.assign(new Error("Request body too large"), { status: 413 }),
        );
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });

// Sent with every response: no content sniffing, no embedding this app in another site's
// frame (clickjacking the Send button), and no Referer leaking local URLs.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

const sendJson = (res, status, obj) => {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(obj));
};

module.exports = { readBody, sendJson, SECURITY_HEADERS };
