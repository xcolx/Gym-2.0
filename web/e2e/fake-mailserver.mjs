// Stands in for infra/mailserver in the end-to-end tests: the backend sends its emails here (MAILSERVER_URL) and the
// tests read the links from GET /emails?email=...

import { createServer } from "node:http";

const port = Number(process.env.E2E_MAIL_PORT ?? 5103);
const emails = [];

const readJSON = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  if (request.method === "POST" && url.pathname.startsWith("/api/send-")) {
    emails.push({ kind: url.pathname.slice("/api/send-".length), ...(await readJSON(request)) });
    response.writeHead(200, { "content-type": "application/json" }).end('{"success":true}');
  } else if (request.method === "GET" && url.pathname === "/emails") {
    const email = url.searchParams.get("email");
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(emails.filter((e) => e.email === email)));
  } else if (url.pathname === "/health") {
    response.writeHead(200).end("ok");
  } else {
    response.writeHead(404).end();
  }
}).listen(port, () => console.log(`Fake mailserver on http://localhost:${port}`));
