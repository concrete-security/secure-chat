FROM vllm/vllm-openai:v0.13.0

COPY harmony-streaming-tool-call-fallback.patch /tmp/
RUN SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") \
    && patch -p1 -d "$SITE" < /tmp/harmony-streaming-tool-call-fallback.patch \
    && rm /tmp/harmony-streaming-tool-call-fallback.patch
