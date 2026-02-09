SHELL := /bin/bash

BENCH_CONFIG ?= config.mk
include $(BENCH_CONFIG)
export

INPUT_ARGS :=
EXTRA_ARGS := dataset-name=$(DATASET)

ifeq ($(DATASET),random)
    INPUT_ARGS += random-input-len=$(INPUT_SIZE) \
                  random-output-len=$(OUTPUT_SIZE)
endif

ifeq ($(DATASET),prefix_repetition)
    PREFIX_LEN := $(shell echo $$(( $(INPUT_SIZE) * $(REPEAT_RATIO) / 100 )))
    SUFFIX_LEN := $(shell echo $$(( $(INPUT_SIZE) - $(PREFIX_LEN) )))

    EXTRA_ARGS += prefix-repetition-prefix-len=$(PREFIX_LEN) \
                  prefix-repetition-num-prefixes=$(NUM_PREFIXES) \
                  prefix-repetition-suffix-len=$(SUFFIX_LEN) \
                  prefix-repetition-output-len=$(OUT_LEN_PREFIX)
endif

ifeq ($(DATASET),burstgpt)
    EXTRA_ARGS += dataset-path=$(BURSTGPT_DATASET_PATH)
endif


.PHONY: setup
setup:
	@echo "Creating virtual environment (Python 3.12)..."
	@uv venv --python 3.12 .venv
	@uv sync --all-groups
	@echo "✅ Setup complete!"
	@uv pip show vllm


.PHONY: single-vllm-bench
single-vllm-bench:
	@echo "🚀 Launching single vLLM benchmark via bench_engine..."
	uv run python3 $(SCRIPT) single-run \
		--url $(URL) \
		--run_id $(RUN_ID) \
		--model $(MODEL) \
		--machine $(MACHINE) \
		--runtime $(RUNTIME) \
		--side $(SIDE) \
		--endpoint $(ENDPOINT) \
		--input-dir $(BENCHMARK_INPUT_DIR) \
		$(INPUT_ARGS) \
		num-prompts=$(NUM_PROMPTS) \
		request-rate=$(REQUEST_RATE) \
		max-concurrency=$(MAX_CONCURRENCY) \
		$(EXTRA_ARGS)

.PHONY: combine-results
combine-results:
	@echo "Combining results into CSV..."
	uv run python3 $(SCRIPT) combine \
		--input-dir $(BENCHMARK_INPUT_DIR) \
		--output_dir $(BENCHMARK_OUTPUT_DIR)

.PHONY: bench-tee-vs-no-tee
bench-tee-vs-no-tee:
	$(eval SHARED_ID := $(shell python3 -c 'import uuid; print(uuid.uuid4().hex[:5])'))
	$(MAKE) single-vllm-bench URL=https://vllm.concrete-security.com RUN_ID=$(SHARED_ID)
	$(MAKE) single-vllm-bench URL=http://89.169.96.185 RUN_ID=$(SHARED_ID)
	$(MAKE) combine-results

.PHONY: all-benchmarks
all-benchmarks:
	# dataset=burstgpt, request_rate=[inf, 1, 3], max_concurrency=[inf, 5, 20, 30]
	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt \
		REQUEST_RATE=1

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt \
		MAX_CONCURRENCY=5 \
		REQUEST_RATE=3

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt \
		MAX_CONCURRENCY=5

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt \
		MAX_CONCURRENCY=20

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=burstgpt \
		MAX_CONCURRENCY=30

	# dataset=prefix_repetition, request_rate=inf, max_concurrency=[1, 5, 15], REPEAT_RATIO=[50, 80]
	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=1 \
		REPEAT_RATIO=50

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=5 \
		REPEAT_RATIO=50

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=15 \
		REPEAT_RATIO=50

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=1 \
		REPEAT_RATIO=80

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=5 \
		REPEAT_RATIO=80

	$(MAKE) bench-tee-vs-no-tee \
		NUM_PROMPTS=100 \
		DATASET=prefix_repetition \
		MAX_CONCURRENCY=15 \
		REPEAT_RATIO=80

	# dataset=random, input-size=32, output-size=32, request_rate=inf, max_concurrency=[5, 20, 30]
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=32 \
		OUTPUT_SIZE=32 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=5

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=32 \
		OUTPUT_SIZE=32 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=20

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=32 \
		OUTPUT_SIZE=32 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=30

	# dataset=random, input-size=64, output-size=64, request_rate=inf, max_concurrency=[5, 20, 30]
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=64 \
		OUTPUT_SIZE=64 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=5

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=64 \
		OUTPUT_SIZE=64 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=20

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=64 \
		OUTPUT_SIZE=64 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=30

	# dataset=random, input-size=128, output-size=128, request_rate=inf, max_concurrency=[5, 20, 30]
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=128 \
		OUTPUT_SIZE=128 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=5

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=128 \
		OUTPUT_SIZE=128 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=20

	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=128 \
		OUTPUT_SIZE=128 \
		NUM_PROMPTS=100 \
		DATASET=random \
		MAX_CONCURRENCY=30

	# dataset=random, input-size=512, output-size=256, request_rate=1, max_concurrency=inf
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=512 \
		OUTPUT_SIZE=256 \
		NUM_PROMPTS=100 \
		DATASET=random \
		REQUEST_RATE=1

	# dataset=random, input-size=1000, output-size=500, request_rate=1, max_concurrency=inf
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=1000 \
		OUTPUT_SIZE=500 \
		NUM_PROMPTS=100 \
		DATASET=random \
		REQUEST_RATE=1

	# dataset=random, input-size=4096, output-size=1024, request_rate=1, max_concurrency=inf
	$(MAKE) bench-tee-vs-no-tee \
		INPUT_SIZE=4096 \
		OUTPUT_SIZE=1024 \
		NUM_PROMPTS=100 \
		DATASET=random \
		REQUEST_RATE=1
