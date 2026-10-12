import net from "node:net";
import { spawnSync } from "node:child_process";

function getWslIp() {
  try {
    const result = spawnSync("wsl.exe", ["hostname", "-I"], { encoding: "utf8", timeout: 10000 });
    if (result.status === 0) {
      const ip = result.stdout.trim().split(/\s+/)[0];
      if (ip) return ip;
    }
  } catch {}
  return "127.0.0.1";
}

let wslIp = getWslIp();

const server = net.createServer((client) => {
  const target = net.connect(2375, wslIp);
  client.pipe(target);
  target.pipe(client);
  client.on("error", () => target.destroy());
  target.on("error", () => client.destroy());
});

server.listen(2375, "127.0.0.1", () => {
  console.log(`Docker proxy ready: 127.0.0.1:2375 -> ${wslIp}:2375`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("Port 2375 already in use, proxy may already be running.");
  } else {
    console.error("Docker proxy error:", err.message);
  }
});

// Periodically refresh WSL IP if needed
setInterval(() => {
  const freshIp = getWslIp();
  if (freshIp && freshIp !== wslIp) {
    wslIp = freshIp;
    console.log(`Updated WSL IP to ${wslIp}`);
  }
}, 30000);
