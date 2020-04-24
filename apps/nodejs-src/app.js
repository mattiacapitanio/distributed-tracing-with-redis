const taskRunner = require('./taskRunner')
const tracer = require('./tracer').Tracer()

async function runCommand(cmd) {
    await require('child_process').execSync(cmd)
}

async function taskOne(jobId) {
    await runCommand(`node /usr/src/nodejs-app/worker.js ${jobId}`)
}

async function taskTwo(jobId) {
    // await runCommand(`python3 /usr/src/python-app/app.py ${id}`)
}


(async () => {
    while (true) {
        const jobId = Math.floor(new Date() / 1000)
        const mainSpan = await tracer.createSpan('main-span')
        mainSpan.log({
            'event': 'debug', 
            'jobid': jobId, 
            'message': `Start new job with id: ${jobId}`
        })
        await tracer.saveContext(jobId, mainSpan.context())
        mainSpan.finish()
        console.log('up!')
        await taskOne(jobId)
        // await taskTwo(jobId)
        console.log('done!')
        await taskRunner.simulateOperation(30000, 90000)
    }
}) ();
