"use client";

import { useState } from "react";

export default function OnboardingPhoto() {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/couple.jpg"
      alt="Le gymbro et la fitgirl"
      onError={() => setOk(false)}
      className="mt-8 w-full rounded-2xl object-cover"
    />
  );
}
