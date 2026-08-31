import { parseStatusArgs } from "./parse-args.js";
import { statusDir } from "./paths.js";
import { deleteStatus, writeStatus } from "./status-file.js";

export async function runCli(argv: string[], env: NodeJS.ProcessEnv, now = Date.now()): Promise<number> {
  try {
    const parsed = parseStatusArgs(argv, now);
    const dir = statusDir(env);
    if (parsed.action === "clear") deleteStatus(dir, parsed.instanceId);
    else writeStatus(dir, parsed.snapshot);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

const isDirect = Boolean(process.argv[1] && /main\.(ts|js)$/i.test(process.argv[1]));
if (isDirect) {
  runCli(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
