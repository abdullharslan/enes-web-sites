import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { passwordProblems } from "@/lib/server/auth/password";
import { ROLES, type Role } from "@/lib/server/auth/permissions";
import { createUserFromCommandLine } from "@/lib/server/auth/users";
import { operatorMessage } from "@/lib/server/error-summary";
import { connect } from "./connection";
import { isMain } from "./is-main";

/** Reads a password from the terminal without echoing it. Never from argv or env. */
async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error("Run this command in an interactive terminal");
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = true;
  const value = await answer;
  rl.close();
  process.stdout.write("\n");
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "owner" },
    },
  });
  if (!values.email || !values.name)
    throw new Error(
      'Usage: npm run admin:create -- --email you@example.com --name "Ad Soyad" [--role owner|editor]',
    );
  if (!(ROLES as readonly string[]).includes(values.role ?? ""))
    throw new Error(`Role must be one of: ${ROLES.join(", ")}`);

  const password = await promptHidden("Parola (en az 12 karakter): ");
  const problems = passwordProblems(password);
  if (problems.length) throw new Error(`Parola kabul edilmedi: ${problems.join(", ")}`);
  if ((await promptHidden("Parola (tekrar): ")) !== password)
    throw new Error("Parolalar eşleşmiyor");

  const { db, close } = connect(process.env.DATABASE_URL, { max: 1 });
  try {
    const user = await db.transaction((tx) =>
      createUserFromCommandLine(tx, {
        email: values.email!,
        name: values.name!,
        role: values.role as Role,
        password,
      }),
    );
    console.log(`Kullanıcı oluşturuldu: ${user.email} (${user.role})`);
  } finally {
    await close();
  }
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(operatorMessage(error));
    process.exitCode = 1;
  });
}
