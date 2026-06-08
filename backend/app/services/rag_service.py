import os
from flask import current_app
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

class RAGService:
    def __init__(self):
        # We will store the local chroma DB inside the backend root folder
        self.persist_directory = os.path.join(os.getcwd(), "chroma_db")
        os.makedirs(self.persist_directory, exist_ok=True)
        self.embeddings = None

    def _init_embeddings(self):
        if not self.embeddings:
            api_key = os.environ.get('GEMINI_API_KEY')
            if not api_key:
                try:
                    from flask import current_app
                    api_key = current_app.config.get('GEMINI_API_KEY')
                except RuntimeError:
                    api_key = None
            
            if not api_key:
                raise ValueError("Gemini API Key is not set in environment or config")
            # Using Google's embedding model via LangChain
            self.embeddings = GoogleGenerativeAIEmbeddings(
                model="gemini-embedding-001",
                google_api_key=api_key
            )

    def index_document(self, document_id, text):
        """Indexes a document text into Chroma DB"""
        self._init_embeddings()
        
        # Split text into smaller chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500,
            chunk_overlap=150
        )
        chunks = text_splitter.split_text(text)
        
        if not chunks:
            return 0
            
        metadatas = [{"document_id": document_id, "chunk_index": i} for i in range(len(chunks))]
        
        # Sanitize collection name for chroma (no hyphens)
        collection_name = f"doc_{str(document_id).replace('-', '_')}"
        
        # Delete existing collection if it exists to ensure we don't have duplicate/old chunks
        try:
            self.embeddings = self.embeddings or self._init_embeddings() or self.embeddings
            vector_store = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embeddings,
                collection_name=collection_name
            )
            vector_store.delete_collection()
        except Exception:
            pass # Collection might not exist yet

        # Ingest into Chroma
        vector_store = Chroma.from_texts(
            texts=chunks,
            embedding=self.embeddings,
            metadatas=metadatas,
            persist_directory=self.persist_directory,
            collection_name=collection_name
        )
        return len(chunks)

    def retrieve_context(self, document_id, query, k=5):
        """Retrieves relevant chunks from Chroma DB for a given query"""
        self._init_embeddings()
        collection_name = f"doc_{str(document_id).replace('-', '_')}"
        
        vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings,
            collection_name=collection_name
        )
        docs = vector_store.similarity_search(query, k=k)
        return "\n\n".join([doc.page_content for doc in docs])

rag_service = RAGService()
