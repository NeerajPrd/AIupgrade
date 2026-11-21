import React from "react";

const Skeleton = () => {
  return (
    <div className="w-[80%] mt-10 pt-4">
      <div className="font-normal flex items-center gap-[10px] pb-[10px]">
        <img
          src="/spirit-monkey-icon.png"
          alt="icon"
          className="w-[25px] h-[25px] animate-spin"
        />
        {/* Upgrade: */}
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

export default Skeleton;
