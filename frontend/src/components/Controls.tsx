"use client";
import { useVoice } from "@humeai/voice-react";
import { Button } from "./ui/button";
import { Mic, MicOff, Phone } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Toggle } from "./ui/toggle";
import MicFFT from "./MicFFT";
import { cn } from "@/utils";

export default function Controls() {
  const { disconnect, status, isMuted, unmute, mute, micFft } = useVoice();

  return (
    <div
      className={
        cn(
          "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
          "bg-gradient-to-t from-card via-card/90 to-card/0",
        )
      }
    >
      <AnimatePresence>
        {status.value === "connected" ? (
          <motion.div
            initial={{
              y: "100%",
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={{
              y: "100%",
              opacity: 0,
            }}
            className={
              "p-4 bg-transparent border border-border rounded-lg shadow-sm flex flex-col items-center gap-4"
            }
          >

            <div className={"relative flex items-center flex-col gap-[20px] shrink rounded-full bg-gradient-to-r from-brand-50 via-brand-100 to-brand-50 h-[300px] w-[300px] grow-0 p-[10px]"}>
              <div className="text-2xl">
                Hi Human
              </div>
              <div>
                Let&apos;s have a chat
              </div>
              <MicFFT fft={micFft} className={"fill-current"} />
            </div>
<div className="flex items-center gap-[10px]">
            <Toggle
              pressed={!isMuted}
              onPressedChange={() => {
                if (isMuted) {
                  unmute();
                } else {
                  mute();
                }
              }}
            >
              {isMuted ? (
                <MicOff className={"size-4"} />
              ) : (
                <Mic className={"size-4"} />
              )}
            </Toggle>
            <Button
              className={"flex items-center gap-1"}
              onClick={() => {
                disconnect();
              }}
              variant={"destructive"}
            >
              <span>
                <Phone
                  className={"size-4 opacity-50"}
                  strokeWidth={2}
                  stroke={"currentColor"}
                />
              </span>
              <span>End Call</span>
            </Button>
</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}