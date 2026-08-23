const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", service: "amadlabs-backend" }));
    return;
  }

  res.writeHead(501);
  res.end(JSON.stringify({ status: "not_implemented", path: req.url }));
});

server.listen(PORT, () => {
  console.log(`amadlabs-backend listening on ${PORT}`);
});
