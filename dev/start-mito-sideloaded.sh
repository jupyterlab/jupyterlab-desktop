#!/bin/bash

# Sideload mito-ai development script for JupyterLab Desktop
# This script helps set up a custom Python environment with your development version of mito-ai
# and launches mito-desktop with that environment without modifying global settings

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENV_NAME="mito-dev"
MITO_AI_PATH=""
LAUNCH_AFTER_SETUP=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to convert relative path to absolute path
resolve_path() {
    local path="$1"
    if [[ -z "$path" ]]; then
        echo ""
        return
    fi
    
    # If path is already absolute, return as is
    if [[ "$path" = /* ]]; then
        echo "$path"
        return
    fi
    
    # Convert relative path to absolute
    local abs_path
    abs_path=$(cd "$(dirname "$path")" && pwd)/$(basename "$path")
    echo "$abs_path"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Sideload mito-ai development version into mito-desktop

OPTIONS:
    -p, --mito-path PATH     Path to mito-ai repository (required) - can be relative or absolute
    -n, --env-name NAME      Name for conda environment (default: mito-dev)
    -l, --launch             Launch mito-desktop after setup
    -h, --help               Show this help message

EXAMPLES:
    # Basic setup with absolute mito-ai path
    $0 -p /path/to/mito-ai

    # Basic setup with relative mito-ai path (from current directory)
    $0 -p ../mito/mito-ai

    # Setup with custom environment name
    $0 -p ../mito/mito-ai -n my-mito-dev

    # Setup and launch mito-desktop immediately
    $0 -p ../mito/mito-ai -l

EOF
}

# Function to check if conda is available
check_conda() {
    if ! command -v conda &> /dev/null; then
        print_error "conda is not installed or not in PATH"
        print_status "Please install conda first: https://docs.conda.io/en/latest/miniconda.html"
        exit 1
    fi
    print_success "conda found: $(conda --version)"
}

# Function to check if mito-ai path is valid
check_mito_ai_path() {
    if [[ -z "$MITO_AI_PATH" ]]; then
        print_error "mito-ai path is required"
        show_usage
        exit 1
    fi

    # Convert to absolute path
    MITO_AI_PATH=$(resolve_path "$MITO_AI_PATH")
    print_status "Resolved mito-ai path: $MITO_AI_PATH"

    if [[ ! -d "$MITO_AI_PATH" ]]; then
        print_error "mito-ai path does not exist: $MITO_AI_PATH"
        exit 1
    fi

    if [[ ! -f "$MITO_AI_PATH/setup.py" ]] && [[ ! -f "$MITO_AI_PATH/pyproject.toml" ]]; then
        print_error "mito-ai path does not contain a Python package (no setup.py or pyproject.toml found)"
        exit 1
    fi

    print_success "mito-ai path validated: $MITO_AI_PATH"
}

# Function to create or update conda environment
setup_conda_env() {
    print_status "Setting up conda environment: $ENV_NAME"

    # Get the path to the jlab_server.yaml file
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local yaml_file="$script_dir/../env_installer/jlab_server.yaml"
    
    if [[ ! -f "$yaml_file" ]]; then
        print_error "jlab_server.yaml not found at: $yaml_file"
        exit 1
    fi
    
    print_status "Using dependencies from: $yaml_file"

    # Check if environment exists
    if conda env list | grep -q "^$ENV_NAME "; then
        print_warning "Environment $ENV_NAME already exists."
        print_status "Updating existing environment from jlab_server.yaml..."
        
        # Update existing environment using the YAML file
        conda env update -n "$ENV_NAME" -f "$yaml_file"
    else
        print_status "Creating conda environment from jlab_server.yaml..."
        
        # Create new environment using the YAML file
        conda env create -n "$ENV_NAME" -f "$yaml_file"
    fi

    # Install mito-ai in development mode
    print_status "Installing mito-ai in development mode..."
    conda run -n "$ENV_NAME" pip install -e "$MITO_AI_PATH"
    
    print_success "Conda environment setup complete: $ENV_NAME"
}

# Function to get conda environment path
get_conda_env_path() {
    local python_path
    python_path=$(conda run -n "$ENV_NAME" which python)
    echo "$python_path"
}

# Function to launch mito-desktop with custom environment
launch_mito_desktop() {
    local python_path
    python_path=$(get_conda_env_path)
    
    print_status "Launching mito-desktop with custom environment..."
    print_status "Python path: $python_path"
    
    # Set environment variables for this session only
    export MITO_PYTHON_PATH="$python_path"
    export JUPYTERLAB_DESKTOP_PYTHON_PATH="$python_path"
    
    # Create a temporary launch script that sets the Python path
    local temp_launch_script=$(mktemp)
    cat > "$temp_launch_script" << EOF
#!/bin/bash
# Temporary launch script for mito-desktop with custom Python environment
export MITO_PYTHON_PATH="$python_path"
export JUPYTERLAB_DESKTOP_PYTHON_PATH="$python_path"

# Launch mito-desktop
exec yarn start "\$@"
EOF
    
    chmod +x "$temp_launch_script"
    
    print_status "Starting mito-desktop with custom Python environment..."
    print_status "This instance will use: $python_path"
    print_status "Global settings remain unchanged"
    
    # Launch with the temporary script
    exec "$temp_launch_script"
}

# Function to show next steps
show_next_steps() {
    local python_path
    python_path=$(get_conda_env_path)
    
    echo ""
    print_success "Sideloading setup complete!"
    echo ""
    print_status "Next steps:"
    echo "1. Your mito-ai development environment is ready: $ENV_NAME"
    echo "2. Python path: $python_path"
    echo "3. Mito-ai path: $MITO_AI_PATH"
    echo ""
    print_status "To use your development environment:"
    echo "  # Launch mito-desktop with custom environment:"
    echo "  ./dev/start-mito-sideloaded.sh -p ../mito-ai -l"
    echo ""
    echo "  # Or launch normally (will use bundled environment):"
    echo "  yarn start"
    echo ""
    print_status "Development workflow:"
    echo "1. Make changes in your mito-ai codebase: $MITO_AI_PATH"
    echo "2. Rerun this script to update the mito-desktop environment and see your changes"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--mito-path)
            MITO_AI_PATH="$2"
            shift 2
            ;;
        -n|--env-name)
            ENV_NAME="$2"
            shift 2
            ;;
        -l|--launch)
            LAUNCH_AFTER_SETUP=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_status "Starting mito-ai sideloading setup..."
    
    # Validate inputs
    check_conda
    check_mito_ai_path
    
    # Setup environment
    setup_conda_env
    
    # Show next steps
    show_next_steps
    
    # Launch if requested
    if [[ "$LAUNCH_AFTER_SETUP" == "true" ]]; then
        launch_mito_desktop
    fi
}

# Run main function
main "$@"
