import { NextResponse } from 'next/server';
import { commit } from '@huggingface/hub';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const framesZipFile = formData.get('framesZip') as File | null;
    const metadataFile = formData.get('metadata') as File | null;
    
    // Extract data from form to construct the folder path.
    const uuid = formData.get('uuid') as string;
    const label = formData.get('label') as string;
    const email = formData.get('email') as string;

    if (!videoFile || !framesZipFile || !metadataFile || !uuid || !label || !email) {
      return NextResponse.json({ error: 'Missing required payload data.' }, { status: 400 });
    }

    const token = process.env.HF_TOKEN;
    const repoId = process.env.HF_REPO_ID;

    if (!token || !repoId || token === 'hf_YOUR_SECRET_TOKEN_HERE') {
      return NextResponse.json({ 
        error: 'Hugging Face credentials missing in .env.local file!' 
      }, { status: 500 });
    }

    const basePath = `data/${email}/${label}`;
    
    // Package operations for an atomic Hugging Face commit
    const operations = [
      {
        operation: 'addOrUpdate' as const,
        path: `${basePath}/${uuid}.webm`,
        content: videoFile
      },
      {
        operation: 'addOrUpdate' as const,
        path: `${basePath}/${uuid}_frames.zip`,
        content: framesZipFile
      },
      {
        operation: 'addOrUpdate' as const,
        path: `${basePath}/${uuid}.json`,
        content: metadataFile
      }
    ];

    console.log(`Committing ${uuid} payload to ${repoId}...`);

    const commitOutput = await commit({
      repo: {
        type: 'dataset',
        name: repoId
      },
      credentials: {
        accessToken: token
      },
      title: `Add ${label} sign recorded by client`,
      operations: operations
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error uploading to HF:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
