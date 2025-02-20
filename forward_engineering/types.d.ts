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

export type ColumnDefinition = {
  name: string;
  type: string;
  nullable: boolean;
  isActivated: boolean;
  isCaseSensitive?: boolean;
  length?: number;
  precision?: number;
  primaryKey?: boolean;
  primaryKeyConstraintName?: string;
  scale?: number;
  timePrecision?: number;
  unique?: boolean;
  uniqueKeyConstraintName?: string;
};

export type AppInstance = {
  require: (packageName: string) => unknown;
  general: object;
}

export type ConstraintDtoColumn = {
  name: string;
  isActivated: boolean;
};

export type KeyType = 'PRIMARY KEY' | 'UNIQUE';

export type ConstraintDto = {
  keyType: KeyType;
  name: string;
  columns: ConstraintDtoColumn[];
};

export type JsonSchema = Record<string, unknown>;
