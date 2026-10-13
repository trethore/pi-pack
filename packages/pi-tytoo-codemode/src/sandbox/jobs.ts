import type { QuickJS } from "quickjs-wasi";

type PromiseJobQueue = Pick<ReturnType<QuickJS["_getExports"]>, "qjs_is_job_pending" | "qjs_execute_pending_job">;

const JOBS_PER_POLL = 50;

export function drainPromiseJobs(queue: PromiseJobQueue, shouldInterrupt: () => boolean): void {
  let jobs = 0;
  while (queue.qjs_is_job_pending()) {
    if (queue.qjs_execute_pending_job() < 0) {
      throw new Error("Promise job failed");
    }
    jobs++;
    if (jobs % JOBS_PER_POLL === 0 && shouldInterrupt()) {
      throw new Error("Execution interrupted");
    }
  }
}
