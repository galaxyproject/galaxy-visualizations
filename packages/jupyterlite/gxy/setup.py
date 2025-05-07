from setuptools import setup

setup(
    name="gxy",
    version="0.0.0",
    packages=["gxy"],
    author="Galaxy Team",
    author_email="info@galaxyproject.org",
    description="Utilities to Interact with Galaxy",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/galaxyproject",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.7",
    include_package_data=True,
)