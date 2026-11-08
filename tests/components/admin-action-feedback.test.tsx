import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteInquiryAction,
  type InquiryActionState,
} from "@/app/admin/actions/inquiries";
import { setUserActiveAction, type UserActionState } from "@/app/admin/actions/users";
import { InquiryDeleteForm } from "@/components/admin/inquiry-forms";
import { UserActiveForm } from "@/components/admin/user-forms";
import { T } from "@/lib/admin/text";

vi.mock("@/app/admin/actions/users", () => ({
  changeOwnPasswordAction: vi.fn(),
  changeUserRoleAction: vi.fn(),
  resetUserPasswordAction: vi.fn(),
  setUserActiveAction: vi.fn(),
}));
vi.mock("@/app/admin/actions/inquiries", () => ({
  setInquiryStatusAction: vi.fn(),
  deleteInquiryAction: vi.fn(),
}));

const USER = "11111111-1111-4111-8111-111111111111";

describe("activating or deactivating a user", () => {
  const form = (isActive: boolean) =>
    render(<UserActiveForm userId={USER} userName="Ada" isActive={isActive} />);
  const fail = (error: Extract<UserActionState, { status: "error" }>["error"]) =>
    vi.mocked(setUserActiveAction).mockResolvedValue({ status: "error", error });

  it("posts the opposite of the current state", () => {
    const { container } = form(true);
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("userId")).toBe(USER);
    expect(data.get("active")).toBe("false");
    expect(
      screen.getByRole("button", { name: `${T.users.deactivate}: Ada` }),
    ).toBeTruthy();
  });

  it.each([
    ["forbidden", T.common.forbidden],
    ["notFound", T.users.notFound],
    ["self", T.users.selfChange],
  ] as const)("shows a %s failure on screen", async (error, message) => {
    fail(error);
    form(true);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("confirms a change", async () => {
    vi.mocked(setUserActiveAction).mockResolvedValue({ status: "ok" });
    form(false);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(T.users.activeSaved)).toBeInTheDocument();
  });
});

describe("deleting an inquiry", () => {
  beforeEach(() => {
    const denied: InquiryActionState = { status: "error", error: "forbidden" };
    vi.mocked(deleteInquiryAction).mockResolvedValue(denied);
  });

  it("requires the confirmation box and shows a refusal", async () => {
    render(<InquiryDeleteForm id={USER} />);
    const confirm = screen.getByLabelText(T.inquiries.deleteConfirm);
    expect(confirm).toBeRequired();
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: T.inquiries.delete }));
    expect(await screen.findByText(T.common.forbidden)).toBeInTheDocument();
  });
});
