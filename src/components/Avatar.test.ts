import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BotAvatar,
  InitialsAvatar,
  MausAvatar,
  resolveBotAvatarOutcome,
  type BotAvatarProps,
  type MausAvatarProps,
} from "./Avatar";
import { MASCOT_BODIES } from "../../shared/mascot-bodies";

const render = (props: Partial<MausAvatarProps>) =>
  renderToStaticMarkup(createElement(MausAvatar, { color: "green", animated: false, ...props }));

const renderBot = (bot: Partial<BotAvatarProps["bot"]>) =>
  renderToStaticMarkup(
    createElement(BotAvatar, { bot: { color: "green", ...bot }, animated: false }),
  );

describe("MausAvatar body", () => {
  it("wears the cursor when no body is given", () => {
    expect(render({})).toContain(MASCOT_BODIES.cursor.fit);
  });

  it("wears the body it is given", () => {
    const markup = render({ bodyId: "star" });
    expect(markup).toContain(MASCOT_BODIES.star.fit);
  });

  it("falls back to the cursor for an unknown body", () => {
    // SAFETY: "hexagram" is deliberately not a MascotBodyId, to exercise the runtime fallback for persisted or streamed
    // data.
    expect(render({ bodyId: "hexagram" as MausAvatarProps["bodyId"] })).toContain(
      MASCOT_BODIES.cursor.fit,
    );
  });

  it("paints the body with the per-bot gradient, never a flat black fill", () => {
    const markup = render({ bodyId: "circle" });
    expect(markup).not.toContain('fill="#000000"');
    expect(markup).not.toContain("{{GRADIENT}}");
    expect(markup).toContain("url(#");
  });
});

describe("mascot facial feature colors", () => {
  it.each(["white", "black"] as const)("uses %s for both eyes and mouth on every body type", (mascotFaceColor) => {
    const ink = mascotFaceColor === "white" ? "#ffffff" : "#000000";
    for (const mascotBody of ["cursor", "star", "pumpkin", "vampire"] as const) {
      for (const color of ["green", "chrome"] as const) {
        const markup = render({ color, bodyId: mascotBody, faceColor: mascotFaceColor });
        expect(markup).toContain(`fill="${ink}"`);
        expect(markup).toContain(`stroke="${ink}"`);
        expect(markup).not.toContain('visibility="hidden"');
      }
    }
  });

  it("cuts the features out of the body when no colour is set", () => {
    expect(render({ color: "chrome", faceColor: null })).toContain('stroke="#1E2833"');
    for (const markup of [render({ bodyId: "ghost" }), render({})]) {
      expect(markup).toContain("<mask");
      expect(markup).not.toMatch(/stroke="#(?:ffffff|0d0a10)"/);
    }
  });

  it("does not paint features over an uploaded image", () => {
    const markup = renderBot({ mascotFaceColor: "black", avatarUrl: "/api/attachments/photo.png", avatarCrop: "circle" });
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<svg");
  });
});

describe("BotAvatar's two avatar outcomes", () => {
  it("zooms and positions a custom image inside its crop", () => {
    const markup = renderBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 2,
      avatarFocusX: 0.25,
      avatarFocusY: 0.75,
    });
    expect(markup).toContain("scale(2)");
    expect(markup).toContain("25% 75%");
    expect(markup).toContain("border-radius:50%");
  });

  it("renders a flat cropped image for circle/rounded/square, with no mascot at all", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" });
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<svg");
  });

  it("shows the image as it is, with no mascot face painted on it", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square" });
    expect(markup).toContain("border-radius:0");
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<image");
    expect(markup).not.toContain("radialGradient");
  });

  it("shows the bot's initials when the crop is mascot, image or not", () => {
    const markup = renderBot({ name: "Deal Desk", avatarUrl: "/api/attachments/cat.webp", avatarCrop: "mascot" });
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain('data-bot-initials="DD"');
  });

  it("falls back to the initials when a flat crop has no valid image", () => {
    const markup = renderBot({ name: "Scout", avatarUrl: undefined, avatarCrop: "circle" });
    expect(markup).not.toContain("<img");
    expect(markup).toContain('data-bot-initials="SC"');
  });

  it("draws the initials on a soft tint of the Desk's colour, named for screen readers", () => {
    const markup = renderBot({ name: "Inbox Desk", color: "red" });
    expect(markup).toContain("var(--identity-purple)");
    expect(markup).toContain("color-mix(in srgb, var(--identity-purple) 16%, transparent)");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Inbox Desk"');
  });
});

describe("theme hooks on faces", () => {
  it("marks a bot's picture and its initials, and leaves a decorative mascot unmarked", () => {
    expect(renderBot({ avatarUrl: "/api/attachments/a.png", avatarCrop: "circle" })).toMatch(/<span data-avatar="picture" data-avatar-kind="bot"/);
    expect(renderBot({})).toMatch(/<span data-avatar="initials" data-avatar-kind="bot"/);
    expect(renderBot({ mascotBody: "ghost" })).toMatch(/<span data-avatar="initials" data-avatar-kind="bot"/);
    expect(render({})).not.toContain("data-avatar");
  });

  it("marks the person's picture and their initials", () => {
    expect(renderToStaticMarkup(createElement(InitialsAvatar, { initials: "AL", avatarUrl: "/api/attachments/me.png" }))).toMatch(/<img data-avatar="picture" data-avatar-kind="person"/);
    expect(renderToStaticMarkup(createElement(InitialsAvatar, { initials: "AL" }))).toMatch(/<div data-avatar="initials" data-avatar-kind="person"/);
  });
});

describe("resolveBotAvatarOutcome", () => {
  // imageFailed is set by the <img>'s onError, which renderToStaticMarkup never fires, so the decision is a pure
  // function.
  it("falls back to the gradient mascot for an image that failed to load", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "circle", hasUrl: true, imageFailed: true }),
    ).toBe("gradientMascot");
  });

  it("renders a good flat image flat", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "rounded", hasUrl: true, imageFailed: false }),
    ).toBe("flatImage");
  });

  it("keeps the mascot crop on the gradient mascot even with a loaded image", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "mascot", hasUrl: true, imageFailed: false }),
    ).toBe("gradientMascot");
  });

  it("falls back to the gradient mascot when there is no image at all", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "square", hasUrl: false, imageFailed: false }),
    ).toBe("gradientMascot");
  });
});
