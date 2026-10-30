"use client";

import { User as UserIcon } from "lucide-react";

import { OpensPhotoViewer } from "@/components/ui/PhotoViewer";
import { ProfileCircle } from "@/components/ui/ProfileIcon";
import { imageUrl } from "@/lib/api";
import { formatDate } from "@/lib/domain/format";
import type { Muscle, User } from "@/types/models";

/** Port of ProfileBannerView.swift */
export function ProfileBanner({ user, schemeColor }: { user: User | null; schemeColor: string }) {
  const image = user?.profileImageUrl ? user.profileImageUrl : null;
  const src = imageUrl(image);
  return (
    <div className="flex items-center bg-app/50 pb-5 pt-[calc(10px+env(safe-area-inset-top))] md:rounded-3xl md:pt-2.5">
      <div className="my-[15px] ml-[15px] mr-[5px]">
        <OpensPhotoViewer hash={image} label="Open profile image">
          <ProfileCircle size={80} color={schemeColor}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-my-black">
                <UserIcon size={50} className="fill-current text-my-white" strokeWidth={1} />
              </span>
            )}
          </ProfileCircle>
        </OpensPhotoViewer>
      </div>
      <div className="min-w-0 pl-2">
        {/* Empty until the first sync loaded the user */}
        <p className="truncate text-large-title">{user?.username ?? " "}</p>
        {user?.createdAt && (
          <p className="text-footnote text-my-gray">Tracking with Gym 2.0 since: {formatDate(user.createdAt)}</p>
        )}
      </div>
    </div>
  );
}

/** One of the black cards of HomeView.swift (workouts, time trained, sets) */
export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex h-[100px] min-w-0 flex-col items-center justify-center rounded-[15px] bg-my-black px-5 text-my-white">
      <span className="whitespace-nowrap text-large-title">{value}</span>
      <span className="text-headline font-semibold">{label}</span>
    </div>
  );
}

/** Port of ListOfNotTrainedMusclesView.swift, scrolls within the height of the body image */
export function ListOfNotTrainedMuscles({ muscles }: { muscles: Muscle[] }) {
  return (
    <section className="shrink-0 whitespace-nowrap pl-2 pr-2.5">
      {/* h-0 + min-h-full: take the height of the body image without growing it, then scroll like the ScrollView */}
      <div className="flex h-0 min-h-full flex-col">
        <p>Not trained yet:</p>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {muscles.map((muscle) => (
            <li key={muscle.serverId}>{muscle.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Port of ProgressBarView.swift */
export function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center pl-2.5">
      <div
        className="relative h-2.5 flex-1 rounded-[20px]"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Muscles trained in the last days"
      >
        <div className="absolute inset-y-0 left-0 rounded-[20px] bg-app" style={{ width: `${Math.min(percentage, 100)}%` }} />
        {/* SwiftUI centers a 4pt stroke on the edge, so it overlaps the fill by 2pt */}
        <div className="absolute -inset-0.5 rounded-[20px] border-4 border-my-black" />
      </div>
      <span className="px-2.5">{percentage}%</span>
    </div>
  );
}
