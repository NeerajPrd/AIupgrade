import Image from "next/image";

export const TypingIndicator = () => {
  return (
    <div className="p-4 w-[80%] ">
      <div className="font-normal flex items-center gap-[10px] pb-[10px]">
        <Image
          src="/spirit-monkey-icon.png"
          alt="icon"
          className="w-[25px] h-[25px] animate-spin"
          width={25}
          height={25}
        />
        Spirit Monkey:
      </div>
      <div className="flex flex-col gap-[3px] items-center">
        <div className="flex w-full gap-[5px]">
          <div className="animate-pulse rounded bg-orange-400 h-2 w-full"></div>
          <div className="flex-1">
            <div className="">
              <div className="animate-pulse rounded bg-gray-300 h-2 w-3/4"></div>
              <div className="animate-pulse rounded bg-gray-300 h-2 w-1/2"></div>
            </div>
          </div>
          <div className="animate-pulse rounded bg-orange-400 h-2 w-full"></div>
          <div className="flex-1">
            <div className="">
              <div className="animate-pulse rounded bg-gray-300 h-2 w-3/4"></div>
              <div className="animate-pulse rounded bg-gray-300 h-2 w-1/2"></div>
            </div>
          </div>
        </div>
        <div className="flex w-full gap-[5px]">
          <div className="animate-pulse rounded bg-orange-400 h-2 w-full"></div>
          <div className="flex-1">
            <div className="">
              <div className="animate-pulse rounded bg-gray-300 h-2 w-3/4"></div>
              <div className="animate-pulse rounded bg-gray-300 h-2 w-1/2"></div>
            </div>
          </div>
          <div className="animate-pulse rounded bg-orange-400 h-2 w-full"></div>
          <div className="flex-1">
            <div className="">
              <div className="animate-pulse rounded bg-gray-300 h-2 w-3/4"></div>
              <div className="animate-pulse rounded bg-gray-300 h-2 w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
