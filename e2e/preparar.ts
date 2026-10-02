import { execFileSync } from "node:child_process";

export default function preparar() {
  execFileSync("npm", ["run", "db:teste:up"], { stdio: "inherit" });
  execFileSync("npm", ["run", "db:teste:preparar"], { stdio: "inherit" });
}
