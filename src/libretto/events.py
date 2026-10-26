import json
import struct
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ServerEvent:
    type: str
    epoch: int
    data: dict[str, Any]
    at: float

    def wire(self) -> dict[str, Any]:
        return {"type": self.type, "epoch": self.epoch, "data": self.data, "at": self.at}


def pack_audio(epoch: int, speech_id: str, pcm: bytes) -> bytes:
    header = json.dumps({"epoch": epoch, "speech_id": speech_id}, separators=(",", ":")).encode()
    return struct.pack("!I", len(header)) + header + pcm
