/* IMP-2 — Worker-Thread: führt den Parser-Kern aus und schickt genau ein Ergebnis zurück. */
import { parentPort, workerData } from "node:worker_threads";
import { parseKern } from "./parser-kern.mjs";

parentPort.postMessage(parseKern(workerData));
