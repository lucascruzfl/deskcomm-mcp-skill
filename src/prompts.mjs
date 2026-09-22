import readline from "node:readline/promises";

export async function promptText(label, { defaultValue, input = process.stdin, output = process.stderr } = {}) {
  const rl = readline.createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}

export async function promptSecret(label, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Entrada secreta interativa exige TTY. Use --token-stdin ou --token-env.");
  }
  output.write(`${label}: `);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Operação cancelada."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

export async function readStdin(input = process.stdin) {
  let value = "";
  for await (const chunk of input) value += chunk;
  return value.trim();
}
