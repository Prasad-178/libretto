"""Finalized LiveKit turns enter Libretto; automatic SDK replies are suppressed."""

from livekit.agents import Agent, StopResponse


class WorkflowAgent(Agent):
    def __init__(self, bridge):
        super().__init__(instructions="Libretto owns workflow state and all generated replies.")
        self.bridge = bridge

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        if new_message.text_content:
            await self.bridge.submit_final(new_message.text_content, new_message.id)
            await self.bridge.control(
                {
                    "type": "transcript",
                    "text": new_message.text_content,
                    "turn_id": new_message.id,
                    "epoch": self.bridge.core.epoch,
                }
            )
        raise StopResponse()

    async def on_user_turn_exceeded(self, event) -> None:
        # No independent SDK reply may bypass the workflow.
        await self.bridge.core.emit(
            "error", code="voice_turn_limit", message="Please use a shorter voice turn."
        )

    async def llm_node(self, *args):
        return None
