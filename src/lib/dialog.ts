import { reactive } from "vue";

export type DialogType = "confirm" | "prompt" | "select";

export interface DialogOption {
  label: string;
  value: string;
}

interface DialogState {
  open: boolean;
  type: DialogType;
  title: string;
  message: string;
  value: string;
  placeholder: string;
  options: DialogOption[];
  resolve: ((v: unknown) => void) | null;
}

export const dialog = reactive<DialogState>({
  open: false,
  type: "confirm",
  title: "",
  message: "",
  value: "",
  placeholder: "",
  options: [],
  resolve: null,
});

function open(opts: Partial<DialogState>, resolve: (v: any) => void) {
  dialog.type = opts.type ?? "confirm";
  dialog.title = opts.title ?? "";
  dialog.message = opts.message ?? "";
  dialog.value = opts.value ?? "";
  dialog.placeholder = opts.placeholder ?? "";
  dialog.options = opts.options ?? [];
  dialog.open = true;
  dialog.resolve = resolve;
}

export function confirmDialog(
  message: string,
  title = "确认操作"
): Promise<boolean> {
  return new Promise((resolve) => {
    open({ type: "confirm", message, title }, resolve);
  });
}

export function promptDialog(
  message: string,
  placeholder = "",
  title = "输入",
  initial = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    open({ type: "prompt", message, title, placeholder, value: initial }, resolve);
  });
}

/** Ask the user to pick one of the given options. */
export function selectDialog(
  title: string,
  options: DialogOption[],
  message = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    open(
      {
        type: "select",
        title,
        message,
        options,
        value: options[0]?.value ?? "",
      },
      resolve
    );
  });
}

export function closeDialog(result: boolean | string | null) {
  if (!dialog.open) return;
  dialog.open = false;
  const r = dialog.resolve;
  dialog.resolve = null;
  if (r) r(result);
}
