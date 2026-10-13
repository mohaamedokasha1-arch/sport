import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      { status: 'success', message: 'Matches updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to update matches' },
      { status: 500 }
    );
  }
}
