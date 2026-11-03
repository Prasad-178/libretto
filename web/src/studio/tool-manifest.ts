export type ToolManifest = {
  name: string;
  parameters: { name: string; type: "string" | "boolean"; required: boolean }[];
  results: string[];
};
