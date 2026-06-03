import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) {
          return null;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      })
      .filter(Boolean)
  );
}

const env = {
  ...readEnvFile(".env"),
  ...readEnvFile(".env.local"),
  ...process.env
};

const databaseUrl = env.DATABASE_URL;
if (!databaseUrl?.startsWith("file:")) {
  process.exit(0);
}

const sqlitePath = databaseUrl.slice("file:".length).split("?")[0];
if (!sqlitePath || sqlitePath === ":memory:") {
  process.exit(0);
}

const databasePath = sqlitePath.startsWith("/")
  ? sqlitePath
  : resolve(process.cwd(), sqlitePath);

mkdirSync(dirname(databasePath), { recursive: true });
closeSync(openSync(databasePath, "a"));
