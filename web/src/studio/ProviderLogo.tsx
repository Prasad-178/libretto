import { Cpu } from "lucide-react";
import openai from "@lobehub/icons-static-svg/icons/openai.svg";
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg";
import google from "@lobehub/icons-static-svg/icons/google-color.svg";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import meta from "@lobehub/icons-static-svg/icons/meta-color.svg";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import qwen from "@lobehub/icons-static-svg/icons/qwen-color.svg";
import xai from "@lobehub/icons-static-svg/icons/xai.svg";
import zhipu from "@lobehub/icons-static-svg/icons/zai.svg";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg";
import cohere from "@lobehub/icons-static-svg/icons/cohere-color.svg";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia-color.svg";
import amazon from "@lobehub/icons-static-svg/icons/bedrock-color.svg";
const logos: Record<string, string> = {
  openai,
  anthropic,
  google,
  deepseek,
  "meta-llama": meta,
  mistralai: mistral,
  qwen,
  "x-ai": xai,
  "z-ai": zhipu,
  moonshotai: moonshot,
  cohere,
  nvidia,
  amazon,
};
/** Known brands use bundled Lobe Icons; unknown IDs get an unbranded icon. */
export function ProviderLogo({ id }: { id: string }) {
  const logo = Object.hasOwn(logos, id.split("/")[0])
    ? logos[id.split("/")[0]]
    : undefined;
  return (
    <span className="provider-logo">
      {logo ? (
        <img src={logo} alt="" width={20} height={20} />
      ) : (
        <Cpu size={20} aria-hidden="true" />
      )}
    </span>
  );
}
