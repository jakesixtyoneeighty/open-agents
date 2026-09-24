import { SignInOptions } from "@/components/auth/sign-in-options";
import { MojoAvatar } from "@/components/brand/mojo-avatar";
import { MojoAurora } from "@/components/brand/mojo-aurora";

/** Manifesto quote + final call to action. */
export function MojoCta() {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mojo-border relative mx-auto max-w-[1100px] overflow-hidden rounded-[32px] bg-(--l-surface) px-6 py-16 text-center before:opacity-70 sm:px-16 sm:py-20">
        <MojoAurora intensity="vivid" />
        <div className="relative">
          <MojoAvatar size="xl" status="online" className="mx-auto" />
          <blockquote className="mx-auto mt-8 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            “People solve the most{" "}
            <span className="text-gradient-mojo">important bugs.</span>”
          </blockquote>
          <p className="mx-auto mt-5 max-w-xl text-balance text-(--l-fg-2) sm:text-lg">
            Mojo handles the rest. Hand off the busywork and get back to the
            problems only you can solve.
          </p>
          <div className="mt-8 flex justify-center">
            <SignInOptions />
          </div>
          <p className="mt-4 text-xs text-(--l-fg-3)">
            Good code. Happier people. 🍌
          </p>
        </div>
      </div>
    </section>
  );
}
