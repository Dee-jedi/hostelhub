declare module "@paystack/inline-js" {
  interface ResumeCallbacks {
    onSuccess?: (tx: { id: number; reference: string; message: string }) => void;
    onCancel?: () => void;
    onLoad?: (tx: { id: number; accessCode: string }) => void;
    onError?: (err: { message: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): unknown;
  }
}
