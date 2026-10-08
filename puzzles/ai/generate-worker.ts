// Runs one generation (puzzles/grid/generate.ts) in a worker thread, so puzzles/ai/week.ts can
// stop one that takes too long without leaving it running.
import { parentPort, workerData } from "node:worker_threads";
import { generate, type GenerateOptions } from "../grid/generate.ts";

parentPort!.postMessage(await generate(workerData as GenerateOptions));
