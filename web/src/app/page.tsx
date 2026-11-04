"use client"

import { Suspense } from 'react'
import { NailPageFrame } from '@/components/nail/nail-page-frame'
import { NailWorkbench } from './nail-workbench'

export default function HomePage() {
  return <Suspense><NailPageFrame roles={['owner', 'staff']}>{user => <NailWorkbench user={user} />}</NailPageFrame></Suspense>
}
