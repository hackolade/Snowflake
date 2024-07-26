export type Tag = {
  id: string,
  name: string,
  allowedValues?: Array<{ id: string, value: string }>,
  description?: string,
  orReplace?: boolean,
  ifNotExist?: boolean,
};

export type ObjectTag = {
  id: string,
  tagName?: string,
  tagValue?: string,
};
