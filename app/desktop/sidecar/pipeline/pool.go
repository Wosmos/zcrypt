package pipeline

import "sync"

// WorkerPool manages a pool of goroutines for chunk processing.
type WorkerPool struct {
	jobs    chan ChunkJob
	results chan ChunkResult
	wg      sync.WaitGroup
}

// NewWorkerPool creates a worker pool with the given number of workers.
func NewWorkerPool(workerCount int) *WorkerPool {
	wp := &WorkerPool{
		jobs:    make(chan ChunkJob, workerCount*2),
		results: make(chan ChunkResult, workerCount*2),
	}

	for i := 0; i < workerCount; i++ {
		wp.wg.Add(1)
		go func() {
			defer wp.wg.Done()
			for job := range wp.jobs {
				wp.results <- ProcessChunk(job)
			}
		}()
	}

	// Close results when all workers are done
	go func() {
		wp.wg.Wait()
		close(wp.results)
	}()

	return wp
}

// Submit sends a job to the worker pool. Blocks if pool is at capacity (backpressure).
func (wp *WorkerPool) Submit(job ChunkJob) {
	wp.jobs <- job
}

// Results returns the channel of processed chunk results.
func (wp *WorkerPool) Results() <-chan ChunkResult {
	return wp.results
}

// Close signals that no more jobs will be submitted.
func (wp *WorkerPool) Close() {
	close(wp.jobs)
}
