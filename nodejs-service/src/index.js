var opentracing = require('opentracing')
var initTracer = require('jaeger-client').initTracerFromEnv;
var tracer = initTracer()

async function execute(id) {
    console.log(`Start execution ${id}`)
    const parentSpan = createContinuationSpan(tracer, 'main-span')
    try {
        const firstSpan = tracer.startSpan('task-1', {childOf: parentSpan})
        const t1 = await sleep(3000)
        console.log(`task-1 done!`)
        firstSpan.finish()

        const secondSpan = tracer.startSpan('task-2', {childOf: parentSpan})
        const t2 = await sleep(2000)
        console.log(`task-2 done!`)
        secondSpan.finish()
    } catch(err) {
        parentSpan.setTag('ERROR', err)
    }
    console.log(`Execution ${id} done!`)
    parentSpan.finish()
}

function sleep(msDelay) {
	return new Promise((resolve, reject) => {
		setTimeout(() => { resolve() }, msDelay)
	})
}

function extractContext(tracer) {
    return null
	// return tracer.extract(opentracing.FORMAT_HTTP_HEADERS, undefined)
}

function createContinuationSpan(tracer, spanName) {
	if (extractContext(tracer) == null) {
		return tracer.startSpan(spanName)
    } 
    return tracer.startSpan(spanName, { childOf: incomingSpanContext })
}

(async () => {
    console.log(process.env.JAEGER_SERVICE_NAME)
    console.log(`Start service...`)
    for (let index = 0; index < 3; index++) {
        console.log(`execute ${index}`)
        await execute(index)
        await sleep(5000)
    }
    console.log(`End service`)
    process.exit(0)
}) ();
