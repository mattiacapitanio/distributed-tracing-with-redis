import sys
import os 
import logging
import json
import time
import random
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

def sleep(minDelay, maxDelay=None):
    if maxDelay is not None:
        minDelay = random.random() * (maxDelay - minDelay) + minDelay
    time.sleep(minDelay)

def simulateOperation(minDelay, maxDelay=None, failure=None):
    if failure is not None and random.random() < failure:
        raise ValueError('Operation failed!')
    sleep(minDelay, maxDelay)

def load_data():
    simulateOperation(
        minDelay=.175, maxDelay=.225, failure=0.1
    )

def save_data():
    simulateOperation(
        minDelay=.380, maxDelay=.700, failure=.2
    )

def process_data():
    simulateOperation(
        minDelay=1.5, maxDelay=2.5
    )

def execute_task(id):
    span = create_continuation_span(
        tracer=opentracing.global_tracer(),
        span_name='worker-two',
        id=id)
    with tracer.scope_manager.activate(span, True) as scope:
        try:
            span.log_kv({
                'event': 'debug', 
                'message': 'Start task with job id: {}'.format(id)
            })
            childSpan = tracer.start_span(
                operation_name='load-data',
                child_of=span
            )
            load_data()
            childSpan.finish()

            childSpan = tracer.start_span(
                operation_name='process-data',
                child_of=span
            )
            process_data()
            childSpan.finish()

            childSpan = tracer.start_span(
                operation_name='save-data',
                child_of=span
            )
            save_data()
            childSpan.finish()
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
    execute_task(id=sys.argv[1])
    tracer.close()  # flush any buffered spans
    sleep(.1)
    sys.exit(0)

run()