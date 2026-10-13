import { expect, it, vi } from "vitest";
import { drainPromiseJobs } from "#src/sandbox/jobs";

function jobQueue(count: number) {
  let remaining = count;
  return {
    qjs_is_job_pending: vi.fn(() => (remaining > 0 ? 1 : 0)),
    qjs_execute_pending_job: vi.fn(() => {
      remaining--;
      return 1;
    }),
  };
}

it.each([0, 1, 49, 50, 51, 100, 125])("drains %s jobs and polls after every batch of 50", (count) => {
  // Arrange
  const queue = jobQueue(count);
  const shouldInterrupt = vi.fn(() => false);

  // Act
  drainPromiseJobs(queue, shouldInterrupt);

  // Assert
  expect(queue.qjs_execute_pending_job).toHaveBeenCalledTimes(count);
  expect(shouldInterrupt).toHaveBeenCalledTimes(Math.floor(count / 50));
  expect(queue.qjs_is_job_pending()).toBe(0);
});

it("stops after the first batch when interrupted, leaving pending jobs unexecuted", () => {
  // Arrange
  const queue = jobQueue(125);
  const shouldInterrupt = vi.fn(() => true);

  // Act / Assert
  expect(() => drainPromiseJobs(queue, shouldInterrupt)).toThrow("Execution interrupted");
  expect(queue.qjs_execute_pending_job).toHaveBeenCalledTimes(50);
  expect(shouldInterrupt).toHaveBeenCalledOnce();
  expect(queue.qjs_is_job_pending()).toBe(1);
});

it("polls again when an interrupt arrives after the first batch", () => {
  // Arrange
  const queue = jobQueue(125);
  const shouldInterrupt = vi.fn(() => true).mockReturnValueOnce(false);

  // Act / Assert
  expect(() => drainPromiseJobs(queue, shouldInterrupt)).toThrow("Execution interrupted");
  expect(queue.qjs_execute_pending_job).toHaveBeenCalledTimes(100);
  expect(shouldInterrupt).toHaveBeenCalledTimes(2);
});

it("reports a failed job without processing later jobs", () => {
  // Arrange
  const queue = jobQueue(100);
  queue.qjs_execute_pending_job.mockReturnValueOnce(-1);
  const shouldInterrupt = vi.fn(() => false);

  // Act / Assert
  expect(() => drainPromiseJobs(queue, shouldInterrupt)).toThrow("Promise job failed");
  expect(queue.qjs_execute_pending_job).toHaveBeenCalledOnce();
  expect(shouldInterrupt).not.toHaveBeenCalled();
});

it("accepts a nonnegative job result of zero", () => {
  // Arrange
  const queue = jobQueue(1);
  queue.qjs_is_job_pending.mockReturnValueOnce(1).mockReturnValue(0);
  queue.qjs_execute_pending_job.mockReturnValueOnce(0);

  // Act / Assert
  expect(() => drainPromiseJobs(queue, () => false)).not.toThrow();
  expect(queue.qjs_execute_pending_job).toHaveBeenCalledOnce();
});
