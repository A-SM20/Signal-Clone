import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initials } from "./Avatar";

describe("initials", () => {
  it("uses first letters of the first and last word", () => {
    expect(initials("Alice Chen")).toBe("AC");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });
  it("handles single names, blanks and emoji", () => {
    expect(initials("Bob")).toBe("B");
    expect(initials("  ")).toBe("#");
    expect(initials("😀 Party")).toBe("😀P");
  });
});

describe("Avatar", () => {
  it("renders an image when avatar_url is present", () => {
    render(<Avatar name="Alice" color="#123456" url="/api/files/x.jpg?exp=1&sig=2" size="md" />);
    expect(screen.getByRole("img", { name: "Alice" }).tagName).toBe("IMG");
  });
  it("renders coloured initials otherwise", () => {
    render(<Avatar name="Alice Chen" color="#123456" size="md" />);
    const el = screen.getByRole("img", { name: "Alice Chen" });
    expect(el).toHaveTextContent("AC");
    expect(el).toHaveStyle({ backgroundColor: "#123456" });
  });
});
