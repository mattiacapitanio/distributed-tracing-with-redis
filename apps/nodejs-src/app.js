const opentracing = require('opentracing')
const initTracer = require('jaeger-client').initTracerFromEnv;
const tags = opentracing.Tags
const tracer = initTracer()
const redis = require('redis').createClient({
    host: process.env.REDIS_HOST, 
    port: process.env.REDIS_PORT 
});

// redis.on("error", function(error) {
//   console.error(error);
// });


async function executeHttpRequest(parentSpan) {
    const span = tracer.startSpan('http-request', {childOf: parentSpan})
    span.setTag(tags.HTTP_METHOD, 'https://request-to-url.com/')
    await simulateOperation(500, 2500, 0.5)    
    span.log({'event': 'http-request'});
    span.finish()
}

async function loadData(parentSpan) {
    const span = tracer.startSpan('load-data', {childOf: parentSpan})
    await simulateOperation(100, 150, 0.1)
    const rows = []
    for (let index = Math.random() * 100; index > 0; index--) {
        rows.push(index)
    }
    span.setTag('rows-count', rows.length)
    span.log({'event': 'load-data', 'rows-count': rows.length, 'message': 'Data loaded from db'})
    span.finish()
    return rows
}

async function processData(parentSpan) {
    const span = tracer.startSpan('process-data', {childOf: parentSpan})
    await simulateOperation(500, 1500)
    const value = Math.random() * 10
    span.setTag( 'result-value', value)
    span.log({'event': 'process-data', 'result-value': value, 'message': 'Data processed'})
    span.finish()
    return value
}

async function saveData(parentSpan) {
    const span = tracer.startSpan('save-data', {childOf: parentSpan})
    span.log({'event': 'save-data', 'message': 'Result correctly saved on db'});
    await simulateOperation(200, 250, 0.1)
    span.finish()
}

async function workerOne(id) {
    const parentSpan = await createContinuationSpan(tracer, 'worker-one', id)
    parentSpan.setTag('job-id', id)
    parentSpan.log({'event': 'debug', 'job-id': id, 'message': `Start execution for job id: ${id}`})
    try {
        await executeHttpRequest(parentSpan)
        parentSpan.setTag('rows-count', await loadData(parentSpan))
        parentSpan.setTag('result-value', await processData(parentSpan))
        await saveData(parentSpan)
    } catch(err) {
        parentSpan.setTag(tags.ERROR, true)
        parentSpan.log({'event': 'error', 'error.object': err, 'message': err.message, 'stack': err.stack})

    }
    parentSpan.log({'event': 'debug', 'job-id': id, 'message': `End execution for job id: ${id}`})
    parentSpan.finish()
}

async function workerTwo(id) {
    require('child_process').execSync(`python3 /usr/src/python-app/app.py ${id}`);
}

function sleep(msDelay, maxDelay = undefined) {
    return new Promise((resolve, reject) => {
        if (maxDelay) {
            msDelay = Math.random() * (maxDelay - msDelay) + msDelay
        }
        console.log(msDelay)
        setTimeout(() => { resolve() }, msDelay)
	})
}

async function simulateOperation(msDelay, maxDelay=undefined, failure=undefined) {
    if (failure && Math.random() < failure)
        throw 'Error: operation failed!'
    await sleep(msDelay, maxDelay)
}

function saveContext(id, context) {
    return new Promise((resolve, reject) => {
        var map = {}
        tracer.inject(context, opentracing.FORMAT_TEXT_MAP, map)
        redis.set(id, JSON.stringify(map), (err) => {
            if (err) { reject(err) }
            resolve()
        })
    })
}

function loadContext(id) {
    return new Promise((resolve, reject) => {
        if (!id) resolve(undefined)
        redis.get(id, (err, reply) => {
            if (err) {
                reject(err)
            }
            if (reply) { 
                resolve(JSON.parse(reply.toString()))
            } else {
                resolve(undefined)
            }
        })
    })
}

function extractContext(tracer, context) {
    if (context) {
        return tracer.extract(opentracing.FORMAT_TEXT_MAP, context)
    }
    return undefined
}

async function createContinuationSpan(tracer, spanName, id = undefined) {
    const incomingSpanContext = extractContext(tracer, await loadContext(id))
	if (incomingSpanContext) {
        return tracer.startSpan(spanName, { childOf: incomingSpanContext })
    } 
    return tracer.startSpan(spanName)
}

(async () => {
    while (true) {
        const jobId = Math.floor(new Date() / 1000)
        console.log(`Start new job with id: ${jobId}`)

        const mainSpan = await createContinuationSpan(tracer, 'main-span')
        await saveContext(jobId, mainSpan.context())
        await workerOne(jobId)
        await workerTwo(jobId)
        console.log(`End job with id: ${jobId}`)
        
        mainSpan.finish()
        await sleep(30000, 90000)
    }
    // process.exit(0)
}) ();
