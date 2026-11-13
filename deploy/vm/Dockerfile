# Coletor de book + tick + delta do WIN.
# Roda em network_mode: host para alcançar a ponte RPyC em 127.0.0.1:18812.
FROM python:3.12-slim

RUN pip install --no-cache-dir rpyc==6.0.1 psycopg2-binary==2.9.10

WORKDIR /app
COPY scripts/     /app/scripts/
COPY run_sessao.sh /app/run_sessao.sh
RUN chmod +x /app/run_sessao.sh

# sem buffer: o log precisa aparecer na hora no docker logs
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/app/run_sessao.sh"]
