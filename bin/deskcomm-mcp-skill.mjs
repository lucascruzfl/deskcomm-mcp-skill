#!/usr/bin/env node
import { runCli } from "../src/cli.mjs";

try {
  process.exitCode = await runCli();
} catch (error) {
  process.stderr.write(`Erro: ${error?.message ?? "falha inesperada"}\n`);
  process.exitCode = 1;
}
