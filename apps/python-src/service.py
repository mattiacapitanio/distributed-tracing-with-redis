import sys
import os 
import logging
import json
from time import sleep
import opentracing
from opentracing.propagation import Format
import redis
from jaeger_client import Config

def init_tracer():
    logging.getLogger('').handlers = []
    logging.basicConfig(format='%(message)s', level=logging.DEBUG)
    config = Config(
        config={
            'sampler': {
                'type': os.environ['JAEGER_SAMPLER_TYPE'],
                'param': os.environ['JAEGER_SAMPLER_PARAM'],
            },
            'local_agent': {
                'reporting_host': os.environ['JAEGER_AGENT_HOST'],
                'reporting_port': os.environ['JAEGER_AGENT_PORT_COMPACT'],
            },
            'logging': True,
        },
        service_name=os.environ['JAEGER_PYTHON_APP_NAME'],
    )
    return config.initialize_tracer()

tracer = init_tracer()
redis_cli = redis.Redis(
    host=os.environ['REDIS_HOST'], 
    port=os.environ['REDIS_PORT'],
    db=0
)


def execute_task(id):
    # span = tracer.start_span('say-hello')
    span = create_continuation_span(
        tracer=opentracing.global_tracer(),
        span_name='my-task',
        id=id)
    with tracer.scope_manager.activate(span, True) as scope:
        try:
            span.set_tag('job-id', '{}'.format(id))
            span.set_tag('say-hello-to', 'me')
            span.log_kv({'event': 'string-format', 'value': 'log-me'})
            sleep(1)
        except Exception as e:
            span.set_tag('error', e)
        finally:
            scope.close()

def load_carrier(id):
    if id is None:
        return None
    byte = redis_cli.get(id)
    if byte is None:
        return None
    try:
        carrier = json.loads(byte.decode("utf-8"))
    except Exception as e:
        return None
    return carrier

def extract_context(tracer, carrier):
    if (carrier is None):
        return None
    return tracer.extract(
        format=Format.TEXT_MAP,
        carrier=carrier
    )

# Inject:
# http_header_carrier = {}
# opentracing.global_tracer().inject(
#     span_context=outbound_span,
#     format=Format.HTTP_HEADERS,
#     carrier=http_header_carrier)

def create_continuation_span(tracer, span_name, id):
    incoming_span_context = extract_context(tracer, load_carrier(id))
    if (incoming_span_context is not None):
        return tracer.start_span(
            operation_name=span_name,
            child_of=incoming_span_context
        )
    return tracer.start_span(operation_name=span_name)

def run(): 
    job_id=sys.argv[1]
    print('Start service id: {}'.format(job_id))
    execute_task(job_id)
    print('End service')
    tracer.close()  # flush any buffered spans
    sleep(1)
    sys.exit(0)

run()