'use strict';

/**
 * In-process job worker for the /api/jobs queue.
 *
 * Sequential by design (sharp already uses libvips threads internally and the
 * container reports sharp.concurrency() === 1). Every job is wrapped in its own
 * try/catch: server.js keeps the process alive on unhandled rejections, so a
 * silent failure here would otherwise leave a job "processing" forever.
 *
 * Batch semantics match the measurement gate: the first failing file fails the
 * job ("Halting batch"); results produced before it are kept in resultPaths.
 */
const fs = require('fs');
const path = require('path');

function safeBase(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'scan';
}

/**
 * @param {object} deps
 * @param {Map} deps.registry            id -> job (mutated in place)
 * @param {(inputPath:string, job:object) => Promise<{buffer:Buffer,width:number,height:number,steps:any[]}>} deps.processFile
 * @param {string} deps.inputDir         where job.filenames live
 * @param {string} deps.outDir           where results are written
 * @param {string} [deps.publicPrefix]   URL prefix for outDir ('/enhanced')
 * @param {(msg:object)=>void} [deps.broadcast]
 * @param {(...a:any[])=>void} [deps.log]
 */
function createWorker({ registry, processFile, inputDir, outDir, publicPrefix = '/enhanced', broadcast = () => {}, log = () => {} }) {
  const queue = [];
  let running = false;

  const emit = (type, job, extra = {}) => {
    try { broadcast({ type, jobId: job.id, status: job.status, progress: job.progress, ...extra }); } catch { /* ignore */ }
  };

  async function runJob(job) {
    job.status = 'processing';
    job.startedAt = Date.now();
    job.progress = 0;
    job.error = null;
    job.results = [];
    emit('job:started', job);
    const total = job.filenames.length;
    for (let i = 0; i < total; i++) {
      const filename = job.filenames[i];
      const inputPath = path.join(inputDir, path.basename(filename));
      try {
        if (!fs.existsSync(inputPath)) throw new Error(`Input file missing: ${filename}`);
        const result = await processFile(inputPath, job);
        const outName = `${job.id}_${String(i + 1).padStart(2, '0')}_${safeBase(filename)}.jpg`;
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, outName), result.buffer);
        const publicPath = `${publicPrefix}/${outName}`;
        job.resultPaths.push(publicPath);
        job.results.push({ source: filename, output: publicPath, width: result.width, height: result.height, steps: result.steps });
        job.progress = Math.round(((i + 1) / total) * 100);
        emit('job:progress', job, { file: filename, output: publicPath });
      } catch (err) {
        job.status = 'failed';
        job.error = `${filename}: ${err.message}`;
        job.completedAt = Date.now();
        log(`[worker] job ${job.id} failed on ${filename}: ${err.message}`);
        emit('job:failed', job, { error: job.error });
        return;
      }
    }
    job.status = 'complete';
    job.progress = 100;
    job.completedAt = Date.now();
    log(`[worker] job ${job.id} complete (${total} file${total === 1 ? '' : 's'})`);
    emit('job:complete', job, { resultPaths: job.resultPaths });
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        if (!registry.has(job.id)) continue;
        await runJob(job);
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(job) {
      queue.push(job);
      // fire and forget; drain() has its own error boundary per job
      drain().catch((e) => log(`[worker] drain error: ${e.message}`));
      return queue.length;
    },
    pending: () => queue.length,
    isRunning: () => running,
    /** Await until the queue is empty — used by tests. */
    async idle() {
      while (running || queue.length) await new Promise((r) => setTimeout(r, 20));
    },
  };
}

module.exports = { createWorker, safeBase };
