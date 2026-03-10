import { type NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { BlockService } from '@/services/blockServices';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;
    const { id, coverUrl } = await req.json();
    const updateCover = await BlockService.updateCover({
      blockId: id,
      coverUrl,
      userId: String(user._id),
      userEmail: user.email,
      userName: user.name || "Unknown"
    });

    return NextResponse.json({
      url: updateCover.url,
    });
  } catch (error) {
    console.error('Error uploading cover:', error);
    return NextResponse.json({ message: 'Upload failed' }, { status: 500 });
  }
}


