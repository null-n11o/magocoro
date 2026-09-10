export type StampKind = "read" | "cute";

export type Stamps = {
  read: number;
  cute: number;
};

export type LetterMediaPublic =
  | { kind: "photos"; photoUrls: string[] }
  | { kind: "clip"; clipUrl: string }
  | { kind: "mixed"; photoUrls: string[]; clipUrl: string };

export type LetterPublic = {
  id: string;
  createdAt: string;
  expiresAt: string;
  addressTo: string;
  body: string;
  signature: string;
  media: LetterMediaPublic;
  audioUrl: string | null;
  stamps: Stamps;
};

export type CreateLetterInput = {
  addressTo: string;
  body: string;
  signature: string;
  media:
    | { kind: "photos"; photos: File[] }
    | { kind: "clip"; clip: File }
    | { kind: "mixed"; photos: File[]; clip: File };
  audio?: File;
};

export type LetterGetResult =
  | { status: "ok"; letter: LetterPublic }
  | { status: "not_found" }
  | { status: "expired" };

export type StampResult =
  | { status: "ok"; stamps: Stamps }
  | { status: "not_found" }
  | { status: "expired" };

export type LetterApi = {
  createLetter(input: CreateLetterInput): Promise<{ id: string }>;
  getLetter(id: string): Promise<LetterGetResult>;
  addStamp(id: string, kind: StampKind): Promise<StampResult>;
};
