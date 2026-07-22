export type VectorizationOptions = Readonly<{
  ltres: number;
  qtres: number;
  pathomit: number;
  colorsampling: number;
  numberofcolors: number;
  mincolorratio: number;
  colorquantcycles: number;
  blurradius: number;
  blurdelta: number;
  scale: number;
  roundcoords: number;
  viewbox: boolean;
  desc: boolean;
}>;

export type ImageWorkerRequest =
  | Readonly<{
      type: 'process';
      requestId: string;
      width: number;
      height: number;
      pixels: ArrayBuffer;
      options: VectorizationOptions;
    }>
  | Readonly<{
      type: 'cancel';
      requestId: string;
    }>;

export type ImageWorkerErrorCode =
  | 'INVALID_PIXELS'
  | 'VECTORIZATION_FAILED'
  | 'WORKER_FAILED';

export type ImageWorkerResponse =
  | Readonly<{
      type: 'success';
      requestId: string;
      svg: string;
    }>
  | Readonly<{
      type: 'cancelled';
      requestId: string;
    }>
  | Readonly<{
      type: 'error';
      requestId: string;
      error: Readonly<{ code: ImageWorkerErrorCode; message: string }>;
    }>;
