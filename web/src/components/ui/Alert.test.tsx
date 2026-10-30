import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Alert, PromptAlert } from "./Alert";

function OpenAlert(props: Omit<React.ComponentProps<typeof Alert>, "open" | "onClose">) {
  const [open, setOpen] = useState(true);
  return <Alert {...props} open={open} onClose={() => setOpen(false)} />;
}

describe("Alert", () => {
  it("puts the cancel button left of the other one and calls the chosen button once it closed", async () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(
      <OpenAlert
        title="Delete Workout?"
        message="This can't be undone."
        buttons={[
          { label: "Delete", role: "destructive", onSelect: onDelete },
          { label: "Cancel", role: "cancel", onSelect: onCancel },
        ]}
      />,
    );
    const user = userEvent.setup();

    const dialog = screen.getByRole("alertdialog", { name: "Delete Workout?" });
    expect([...dialog.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Cancel", "Delete"]);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("is cancelled with Escape", async () => {
    const onCancel = vi.fn();
    render(<OpenAlert title="Discard?" buttons={[{ label: "Discard" }, { label: "Keep", role: "cancel", onSelect: onCancel }]} />);

    await userEvent.setup().keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });
});

describe("PromptAlert", () => {
  it("confirms the text only while it is valid", async () => {
    const onConfirm = vi.fn();
    function Prompt() {
      const [open, setOpen] = useState(true);
      return (
        <PromptAlert
          open={open}
          title="Rename"
          placeholder="Name"
          initialValue="Push"
          confirmLabel="Save"
          canConfirm={(text) => text.trim().length > 0}
          onConfirm={onConfirm}
          onClose={() => setOpen(false)}
        />
      );
    }
    render(<Prompt />);
    const user = userEvent.setup();
    const field = screen.getByPlaceholderText("Name") as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(field.value).toBe("Push");

    await user.clear(field);
    expect(save.disabled).toBe(true);
    await user.type(field, "Pull");
    await user.click(save);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Pull"));
  });
});
