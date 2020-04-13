const opentracing = require('opentracing')
const initTracer = require('jaeger-client').initTracerFromEnv;
const tracer = initTracer()
const redis = require('redis').createClient({
    host: process.env.REDIS_HOST, 
    port: process.env.REDIS_PORT 
});

// redis.on("error", function(error) {
//   console.error(error);
// });

async function execute(id, contextId) {
    console.log(`Start execution ${id}`)
    const parentSpan = await createContinuationSpan(tracer, 'process-span', contextId)
    try {
        const firstSpan = tracer.startSpan('task-1', {childOf: parentSpan})
        const t1 = await sleep(250, 750)
        console.log(`task-1 done!`)
        firstSpan.finish()

        const secondSpan = tracer.startSpan('task-2', {childOf: parentSpan})
        const t2 = await sleep(500, 1500)
        console.log(`task-2 done!`)
        secondSpan.finish()
    } catch(err) {
        parentSpan.setTag('ERROR', err)
    }
    console.log(`Execution ${id} done!`)
    parentSpan.finish()
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

function saveContext(id, context) {
    return new Promise((resolve, reject) => {
        var map = {}
        tracer.inject(context, opentracing.FORMAT_TEXT_MAP, map)
        // console.log(`save context: ${JSON.stringify(map)}`)
        redis.set(id, JSON.stringify(map), (err) => {
            if (err) { reject(err) }
            resolve()
        })
    })
}

function loadContext(id) {
    // console.log(`id: ${id}`)
    return new Promise((resolve, reject) => {
        if (!id) resolve(undefined)
        redis.get(id, (err, reply) => {
            if (err) {
                reject(err)
            }
            if (reply) { 
                // console.log(`load context: ${reply.toString()}`); 
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
    // console.log(incomingSpanContext)
	if (incomingSpanContext) {
        return tracer.startSpan(spanName, { childOf: incomingSpanContext })
    } 
    return tracer.startSpan(spanName)
}

(async () => {
    var id = Math.floor(new Date() / 1000)
    console.log(`Start service id: ${id}`)

    const mainSpan = await createContinuationSpan(tracer, 'main-span')
    await saveContext(id, mainSpan.context())

    const childSpan = tracer.startSpan('task-0', {childOf: mainSpan})
    const t2 = await sleep(1000, 2000)
    console.log(`task-0 done!`)
    childSpan.finish()

    for (let index = 0; index < 3; index++) {
        console.log(`execute ${index}`)
        await execute(index, id)
    }

    console.log(`End service`)
    mainSpan.finish()
    await sleep(5000)
    process.exit(0)
}) ();
