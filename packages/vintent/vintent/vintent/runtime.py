from vintent.modules.runner import Runner


async def run(config, inputs, file_name):
    runner = Runner(config)
    reply = await runner.run(inputs["transcripts"], file_name)
    return reply
