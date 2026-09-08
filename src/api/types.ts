export type StampKind = "read" | "cute";

export type Stamps = {
  read: number;
  cute: number;
};

export type LetterPublic = {
  id: string;
  createdAt: string;
  addressTo: string;
  body: string;
  signature: string;
  photoUrls: string[];
  stamps: Stamps;
};

export type CreateLetterInput = {
  photos: File[];
  addressTo: string;
  body: string;
  signature: string;
};

export type LetterApi = {
  createLetter(input: CreateLetterInput): Promise<{ id: string }>;
  getLetter(id: string): Promise<LetterPublic | null>;
  addStamp(id: string, kind: StampKind): Promise<Stamps | null>;
};
